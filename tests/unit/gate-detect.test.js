// tests/unit/gate-detect.test.js — LENSIQ Gate plate DETECTOR (lensiq-plate.js, round 15): box growth to the plate
// background (the CI "1กข -> กข" miss), plate finder on synthetic RGBA frames (white / dark green / small 3-line plates),
// LPD-YuNet prior generation + decoding, the seeded demo-set definition and the per-category evaluation.
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../lensiq-plate.js");

/** RGBA frame: grey body, a plate (bg colour, frame line, text strokes in ink colour) — pure pixels, no fonts */
function frame(W, H, o = {}) {
  const px = new Uint8ClampedArray(W * H * 4), set = (x, y, c) => { const i = 4 * (y * W + x); px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; };
  const body = o.body || [99, 107, 126], bg = o.bg || [251, 251, 247], ink = o.ink || [17, 17, 17];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, body);
  if (!o.plate) return px;
  const { x: px0, y: py0, w, h } = o.plate;
  for (let y = py0; y < py0 + h; y++) for (let x = px0; x < px0 + w; x++) set(x, y, bg);
  for (let x = px0 + 2; x < px0 + w - 2; x++) { set(x, py0 + 2, ink); set(x, py0 + 3, ink); set(x, py0 + h - 3, ink); set(x, py0 + h - 4, ink); } // frame line
  for (let y = py0 + 2; y < py0 + h - 2; y++) { set(px0 + 2, y, ink); set(px0 + 3, y, ink); set(px0 + w - 3, y, ink); set(px0 + w - 4, y, ink); }
  const lines = o.lines || [[0.15, 0.55, 8], [0.68, 0.85, 12]]; // [top, bottom, strokes] as share of the plate height
  for (const [t, b, n] of lines) {
    const y0 = py0 + Math.round(h * t), y1 = py0 + Math.round(h * b), step = Math.floor((w - 16) / n);
    for (let k = 0; k < n; k++) {
      const sx = px0 + 8 + k * step;
      for (let y = y0; y < y1; y++) for (let x = sx; x < sx + Math.max(2, Math.round(step * 0.3)); x++) set(x, y, ink);
      for (let x = sx; x < sx + Math.round(step * 0.7); x++) { set(x, y0, ink); set(x, y0 + 1, ink); } // a bar: glyphs are not just stems
    }
  }
  return px;
}
const norm = (b, W, H) => ({ x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H });

test("iou / nms: overlap ratio and greedy suppression keep the best box", () => {
  assert.equal(P.iou({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 0, w: 2, h: 2 }), 2 / 6);
  assert.equal(P.iou({ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }), 0);
  const k = P.nms([{ x: 0, y: 0, w: 1, h: 1, score: 0.5 }, { x: 0.05, y: 0, w: 1, h: 1, score: 0.9 }, { x: 3, y: 3, w: 1, h: 1, score: 0.1 }], 0.5);
  assert.deepEqual(k.map(b => b.score), [0.9, 0.1]);
});

test("growToPlate: a text-line box that misses the leading characters grows to the whole plate (never shrinks, stops at the frame)", () => {
  const W = 320, H = 180, plate = { x: 100, y: 70, w: 120, h: 56 }, rgba = frame(W, H, { plate });
  const truth = norm(plate, W, H);
  // main text line only, starting right of the first glyphs (the CI failure: box started after the leading "1")
  const line = norm({ x: 140, y: 78, w: 70, h: 18 }, W, H);
  const g = P.growToPlate(rgba, W, H, line);
  assert.ok(g.grew, "grew");
  assert.ok(P.iou(g, truth) >= 0.8, "grown box covers the plate " + JSON.stringify(g) + " IoU " + P.iou(g, truth).toFixed(2));
  assert.ok(g.x <= line.x && g.x + g.w >= line.x + line.w && g.y <= line.y && g.y + g.h >= line.y + line.h, "never shrinks");
  assert.ok(g.x * W >= plate.x - 1 && (g.x + g.w) * W <= plate.x + plate.w + 1, "does not run into the car body");
  // a whole-plate box stays (almost) the same
  const same = P.growToPlate(rgba, W, H, truth);
  assert.ok(P.iou(same, truth) >= 0.9, "full plate box kept " + JSON.stringify(same));
  // a box on a flat area (no plate background to follow) is returned unchanged
  const flat = P.growToPlate(frame(W, H), W, H, line);
  assert.ok(P.iou(flat, line) > 0.99, "flat field: unchanged");
});

test("findPlates: finds white and dark-green plates and small 3-line plates; a plate-less frame triggers nothing", () => {
  const W = 320, H = 180;
  for (const [name, o] of [["white", {}], ["green", { bg: [31, 122, 58], ink: [255, 255, 255] }], ["yellow", { bg: [245, 196, 0] }]]) {
    const plate = { x: 90, y: 80, w: 130, h: 60 }, rgba = frame(W, H, { plate, ...o });
    const c = P.findPlates(rgba, W, H);
    assert.ok(c.length >= 1, name + ": found nothing");
    assert.ok(P.iou(c[0], norm(plate, W, H)) >= 0.5, `${name}: top box ${JSON.stringify(c[0])} IoU ${P.iou(c[0], norm(plate, W, H)).toFixed(2)}`);
    assert.ok(c[0].score >= P.AUTO_MIN, name + ": scores above the auto-read threshold");
  }
  const moto = { x: 140, y: 60, w: 64, h: 46 }, mr = frame(W, H, { plate: moto, lines: [[0.12, 0.38, 3], [0.45, 0.55, 6], [0.62, 0.9, 4]] });
  const cm = P.findPlates(mr, W, H);
  assert.ok(cm.slice(0, 3).some(b => P.iou(b, norm(moto, W, H)) >= 0.5), "3-line plate among the top 3 " + JSON.stringify(cm.slice(0, 3)));
  const none = P.findPlates(frame(W, H), W, H);
  assert.ok(!none.length || none[0].score < P.AUTO_MIN, "flat frame: no auto-read trigger " + JSON.stringify(none[0]));
});

test("findPlates: o.extra (model) boxes are used as proposals and grown to the plate", () => {
  const W = 320, H = 180, plate = { x: 60, y: 50, w: 140, h: 64 }, rgba = frame(W, H, { plate });
  const extra = [{ ...norm({ x: 100, y: 58, w: 90, h: 26 }, W, H), score: 0.95, src: "yunet" }]; // top line only (as LPD-YuNet does)
  const c = P.findPlates(rgba, W, H, { extra });
  assert.ok(c.some(b => P.iou(b, norm(plate, W, H)) >= 0.7), "model box grown to the plate " + JSON.stringify(c.slice(0, 3)));
});

test("LPD-YuNet: 4385 priors for 320 x 240 (steps 8/16/32/64), decoding gives the 4-corner quad and sqrt(cls * iou) score", () => {
  const pr = P.yunetPriors();
  assert.equal(pr.length / 4, 4385);
  assert.deepEqual([...pr.slice(0, 4)].map(v => +v.toFixed(4)), [+(4 / 320).toFixed(4), +(4 / 240).toFixed(4), +(10 / 320).toFixed(4), +(10 / 240).toFixed(4)]);
  const N = 4385, loc = new Float32Array(N * 14), conf = new Float32Array(N * 2), iou = new Float32Array(N);
  const k = 1000; conf[2 * k + 1] = 0.81; iou[k] = 1;
  // corners at prior centre -/+ 5 units of variance * size
  const q = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
  [4, 6, 10, 12].forEach((a, j) => { loc[14 * k + a] = q[j][0]; loc[14 * k + a + 1] = q[j][1]; });
  const d = P.yunetDecode(loc, conf, iou, { thr: 0.5 });
  assert.equal(d.length, 1);
  assert.equal(d[0].score, 0.9);
  const cx = pr[4 * k], cy = pr[4 * k + 1], sw = pr[4 * k + 2], sh = pr[4 * k + 3];
  assert.ok(Math.abs(d[0].y - (cy - 0.5 * sh)) < 1e-6, "top edge");
  assert.ok(Math.abs(d[0].x - (cx - 0.5 * sw)) < 1e-6 && Math.abs(d[0].w - sw) < 1e-6 && Math.abs(d[0].h - sh) < 1e-6, JSON.stringify(d[0]));
  assert.equal(d[0].quad.length, 8);
  assert.deepEqual(P.yunetDecode(loc, conf, iou, { thr: 0.95 }), []);
});

test("demo set definition: fixed seed, 8 categories x 20, deterministic, valid plates, ranges as documented", () => {
  const a = P.demoSpec(), b = P.demoSpec();
  assert.equal(P.DEMO_SET.seed, 20261108);
  assert.equal(P.DEMO_SET.perCat, 20);
  assert.deepEqual(P.DEMO_SET.cats, ["white", "yellow", "green", "red", "blue", "moto", "night", "none"]);
  assert.equal(a.length, 160);
  assert.deepEqual(a, b, "same seed -> same scenes");
  assert.notDeepEqual(P.demoSpec({ seed: 7 }).map(s => s.key), a.map(s => s.key), "another seed -> other scenes");
  for (const s of a) {
    assert.ok(P.parse(s.key, { moto: s.moto }).ok, "valid plate " + s.key);
    const D = P.DEMO_SET, wr = s.moto ? D.motoW : D.carW;
    assert.ok(s.pw >= wr[0] && s.pw <= wr[1] && Math.abs(s.rot) <= 6, "size / rotation " + JSON.stringify(s));
    assert.ok(s.cx - s.pw / 2 >= 0 && s.cx + s.pw / 2 <= 640 && s.cy - s.ph / 2 >= 0 && s.cy + s.ph / 2 <= 360, "plate inside the frame");
    if (s.cat === "night") assert.ok(s.night && P.PLATE_COLOURS[s.colour]); else assert.ok(!s.night);
  }
  assert.equal(a.filter(s => s.occl).length, 26, "occlusion probability 0.25 -> 26 of 160 with this seed (fixed)");
});

test("detEval: per-category top-1 / top-3 recall at IoU 0.5, exact reads, false triggers on plate-less scenes, 90 % target", () => {
  const t = { x: 0.4, y: 0.5, w: 0.2, h: 0.1 }, hit = { ...t, score: 0.9 }, miss = { x: 0, y: 0, w: 0.1, h: 0.1, score: 0.95 };
  const rows = [
    ...Array.from({ length: 9 }, () => ({ cat: "white", truth: t, boxes: [hit], key: "กข1", read: "กข 1", ms: 10 })),
    { cat: "white", truth: t, boxes: [miss, hit], key: "กข1", read: "กข2", ms: 30 },
    { cat: "moto", truth: t, boxes: [miss, { ...miss, x: 0.5 }, { ...miss, y: 0.6 }, hit], key: "กข1" },
    { cat: "none", truth: null, boxes: [miss] }, { cat: "none", truth: null, boxes: [{ ...miss, score: 0.1 }] }
  ];
  const r = P.detEval(rows);
  assert.equal(r.white.det.x, 9); assert.equal(r.white.det3.x, 10); assert.equal(r.white.read.x, 9); assert.equal(r.white.read.n, 10);
  assert.equal(r.white.target, "met"); assert.equal(r.white.msMedian, 10);
  assert.equal(r.moto.det.x, 0); assert.equal(r.moto.det3.x, 0, "4th box does not count"); assert.equal(r.moto.target, "not met");
  assert.equal(r.none.neg, 2); assert.equal(r.none.fp.x, 1);
});
