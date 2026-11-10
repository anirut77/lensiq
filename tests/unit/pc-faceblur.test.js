"use strict";
// tests/unit/pc-faceblur.test.js — Product Check: face BLUR before upload (owner decision 2026-11-10: blur every detected
// face, never block an upload because of a face). LQPC.faceBlurPlan is pure logic (lensiq-pc.js); the pixels are blurred in
// lensiq-pc-run.js faceBlur (covered by tests/e2e/product-check.e2e.mjs). Fixed set written before the plan was tuned
// (docs/product-check/FACE-BLUR-RESULTS.md §1): pad + clamp, merge of overlapping boxes, mapping to the upload image,
// tiles on / off, threshold, and the FAIL-SAFE: detector missing / failed / not run / malformed score / face without a box
// -> text only, never "send unblurred".
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../lensiq-pc.js");

const st = (frame, upload = [], tiles) => ({ loaded: true, runs: [{ scope: "frame", faces: frame }, ...(tiles ? [{ scope: "tiles", faces: tiles }] : []), { scope: "upload", faces: upload }] });
const face = (x, y, w, h, score = 0.9) => ({ score, box: { x, y, w, h } });
const plan = (s, o = {}, W = 1000, H = 800) => P.faceBlurPlan(s, W, H, { threshold: 0.5, pad: 0, tiles: true, need: ["frame", "upload"], ...o });

test("faceBlurPlan: one face -> one padded region; no face -> no region, and never text only", () => {
  const a = plan(st([face(100, 100, 100, 100)]), { pad: 0.2 });
  assert.equal(a.textOnly, false);
  assert.deepEqual(a.regions, [{ x: 80, y: 80, w: 140, h: 140 }], "20 % of the box added on every side");
  assert.equal(a.faces, 1);
  const none = plan(st([]));
  assert.deepEqual(none, { textOnly: false, regions: [], faces: 0, reason: "" }, "a picture without a face is sent as is (after the preview)");
  assert.equal(plan(st([face(100, 100, 100, 100, 0.49)])).regions.length, 0, "below the threshold");
  assert.equal(plan(st([face(100, 100, 100, 100, 0.5)])).regions.length, 1, ">= threshold is blurred");
  const many = plan(st([face(0, 0, 50, 50), face(400, 400, 50, 50), face(800, 600, 50, 50)]));
  assert.equal(many.regions.length, 3, "a face never blocks: three faces -> three regions, still not text only");
  assert.equal(many.textOnly, false);
});

test("faceBlurPlan: boxes are clamped to the frame / upload image and rounded outwards", () => {
  const c = plan(st([face(-30, -20, 100, 80)]), { pad: 0.1 });
  assert.deepEqual(c.regions, [{ x: 0, y: 0, w: 80, h: 68 }], "clamped at the top-left corner");
  const br = plan(st([face(950, 760, 100, 100)]), { pad: 0 });
  assert.deepEqual(br.regions, [{ x: 950, y: 760, w: 50, h: 40 }], "clamped at the bottom-right corner");
  assert.deepEqual(plan(st([face(1200, 900, 50, 50)])).regions, [], "a face entirely outside the picture is not part of it");
  const fr = plan(st([face(10.4, 20.6, 30.2, 40.1)]));
  assert.deepEqual(fr.regions, [{ x: 10, y: 20, w: 31, h: 41 }], "fractions round outwards: no sliver of a face is left");
  for (const g of plan(st([face(-5, 790, 2000, 300)]), { pad: 0.5 }).regions) assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= 1000 && g.y + g.h <= 800, JSON.stringify(g));
});

test("faceBlurPlan: overlapping boxes (frame + tiles + upload runs, neighbours) are merged into disjoint regions", () => {
  // the same face seen by the frame run and the upload run, slightly shifted -> one region (their union)
  const same = plan(st([face(100, 100, 100, 100)], [face(110, 105, 100, 100, 0.7)]));
  assert.deepEqual(same.regions, [{ x: 100, y: 100, w: 110, h: 105 }]);
  assert.equal(same.faces, 2);
  // a chain: A overlaps B, B overlaps C -> one region; D apart stays apart
  const chain = plan(st([face(0, 0, 100, 100), face(90, 0, 100, 100), face(180, 0, 100, 100), face(600, 600, 50, 50)]));
  assert.deepEqual(chain.regions, [{ x: 0, y: 0, w: 280, h: 100 }, { x: 600, y: 600, w: 50, h: 50 }]);
  // the union of two can newly overlap a third that overlapped neither -> merged too (iterate until stable)
  // (C overlaps neither A = 0..50 nor B = 40..90 on both axes, but it overlaps their union 0..90)
  const late = plan(st([face(70, 0, 20, 20), face(0, 0, 50, 50), face(40, 40, 50, 50)]));
  assert.deepEqual(late.regions, [{ x: 0, y: 0, w: 90, h: 90 }], JSON.stringify(late.regions));
  // padding makes near neighbours overlap
  assert.equal(plan(st([face(0, 0, 100, 100), face(110, 0, 100, 100)]), { pad: 0 }).regions.length, 2);
  assert.equal(plan(st([face(0, 0, 100, 100), face(110, 0, 100, 100)]), { pad: 0.1 }).regions.length, 1);
  // result regions never overlap
  const r = plan(st([face(10, 10, 60, 60), face(50, 50, 60, 60), face(300, 10, 40, 40), face(320, 30, 40, 40), face(700, 500, 90, 90)]), { pad: 0.2 }).regions;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j];
    assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), "disjoint " + JSON.stringify([a, b]));
  }
});

test("faceBlurPlan: regions are mapped into the upload image (crop + scale) and clamped to it", () => {
  // frame 2000 x 1600, crop {500, 400, 1000 x 800} scaled 0.5 -> upload 500 x 400
  const s = st([face(600, 500, 200, 200), face(100, 100, 100, 100), face(1400, 1100, 200, 200)]);
  const p = P.faceBlurPlan(s, 2000, 1600, { threshold: 0.5, pad: 0, tiles: true, need: ["frame", "upload"], crop: { x: 500, y: 400, w: 1000, h: 800 }, scale: 0.5 });
  assert.deepEqual(p.regions, [{ x: 50, y: 50, w: 100, h: 100 }, { x: 450, y: 350, w: 50, h: 50 }], "inside face mapped; outside face dropped; edge face clamped");
});

test("faceBlurPlan: tiles off ignores the tile run; tiles on uses it", () => {
  const s = st([], [], [face(300, 300, 40, 40)]);
  assert.equal(plan(s, { tiles: true, need: ["frame", "tiles", "upload"] }).regions.length, 1);
  assert.equal(plan(s, { tiles: false }).regions.length, 0);
});

test("faceBlurPlan FAIL-SAFE: detector missing / failed / not run -> text only (never send unblurred)", () => {
  for (const [s, reason] of [[null, "model-missing"], [undefined, "model-missing"], [{ loaded: false, runs: [] }, "model-missing"],
    [{ loaded: true, error: "WebGL unavailable", runs: [] }, "error"], [{ loaded: true, runs: [] }, "not-run"],
    [{ loaded: true, runs: [{ scope: "frame", faces: [] }] }, "not-run"], [{ loaded: true, runs: [{ scope: "frame", faces: [] }, { scope: "upload" }] }, "not-run"]]) {
    const p = plan(s);
    assert.equal(p.textOnly, true, JSON.stringify(s));
    assert.equal(p.reason, reason, JSON.stringify(s));
    assert.deepEqual(p.regions, []);
  }
  assert.equal(plan(st([]), { need: ["frame", "tiles", "upload"] }).reason, "not-run", "tiles required but did not run");
  // an error with faces already found is still text only: the run is incomplete
  assert.equal(plan({ loaded: true, error: "x", runs: [{ scope: "frame", faces: [face(1, 1, 10, 10)] }, { scope: "upload", faces: [] }] }).textOnly, true);
});

test("faceBlurPlan FAIL-SAFE: a malformed score -> text only (never read as 0, also in an ignored tile run)", () => {
  for (const bad of [{}, null, { score: NaN }, { score: null }, { score: "0.9" }, { score: Infinity }, { score: -0.1 }, { score: 1.5 }, { box: { x: 1, y: 1, w: 9, h: 9 } }]) {
    const p = plan(st([face(10, 10, 50, 50), bad]));
    assert.deepEqual(p, { textOnly: true, regions: [], faces: 0, reason: "bad-score" }, JSON.stringify(bad));
  }
  assert.equal(plan(st([], [], [{ score: NaN, box: { x: 1, y: 1, w: 5, h: 5 } }]), { tiles: false }).reason, "bad-score");
  // a face at / above the threshold without a usable box cannot be blurred -> text only
  for (const box of [null, undefined, { x: 1, y: 1, w: 0, h: 5 }, { x: NaN, y: 1, w: 5, h: 5 }, { x: 1, y: 1, w: -4, h: 5 }]) {
    assert.equal(plan(st([{ score: 0.9, box }])).reason, "bad-box", JSON.stringify(box));
  }
  assert.equal(plan(st([{ score: 0.1, box: null }])).textOnly, false, "a box-less detection below the threshold is not a face to blur");
  for (const [W, H] of [[0, 100], [100, NaN], [-1, 5]]) assert.equal(P.faceBlurPlan(st([]), W, H, { need: ["frame", "upload"] }).reason, "bad-frame");
});

test("faceBlurPlan: defaults = the picked setting; a plain array of faces reads as one loaded frame run", () => {
  assert.ok(P.FACE_BLUR && typeof P.FACE_BLUR.threshold === "number" && typeof P.FACE_BLUR.pad === "number" && typeof P.FACE_BLUR.tiles === "boolean");
  assert.ok([0.3, 0.4, 0.5, 0.6, 0.7].includes(P.FACE_BLUR.threshold) && [0, 0.15, 0.3].includes(P.FACE_BLUR.pad), "one of the swept settings");
  assert.ok([2, 3, 4].includes(P.FACE_BLUR.grid) && P.FACE_BLUR.overlap > 0 && P.FACE_BLUR.overlap < 0.5 && [1, 2].includes(P.FACE_BLUR.upscale), "a swept tile grid");
  // a plain array is ONE frame run: with the default `need` (frame + upload) that is incomplete -> text only (fail closed);
  // a caller that states it only needs the frame run gets regions
  assert.deepEqual(P.faceBlurPlan([face(100, 100, 100, 100, 0.95)], 1000, 800, { pad: 0 }), { textOnly: true, regions: [], faces: 0, reason: "not-run" });
  assert.equal(P.faceBlurPlan([], 1000, 800).textOnly, true);
  const p = P.faceBlurPlan([face(100, 100, 100, 100, 0.95)], 1000, 800, { pad: 0, need: ["frame"] });
  assert.deepEqual(p.regions, [{ x: 100, y: 100, w: 100, h: 100 }]);
  assert.equal(P.faceBlurPlan([], 1000, 800, { need: ["frame"] }).textOnly, false);
});

test("faceBlurPlan defaults fail closed for direct callers: need = every supplied run + frame + upload; loaded === true; bad scale; malformed runs", () => {
  const ok = { loaded: true, runs: [{ scope: "frame", faces: [] }, { scope: "upload", faces: [] }] };
  assert.equal(P.faceBlurPlan(ok, 1000, 800).textOnly, false, "frame + upload present -> fine without an explicit need");
  assert.equal(P.faceBlurPlan({ loaded: true, runs: [{ scope: "frame", faces: [] }] }, 1000, 800).reason, "not-run", "default need includes upload");
  assert.equal(P.faceBlurPlan({ loaded: true, runs: [{ scope: "upload", faces: [] }] }, 1000, 800).reason, "not-run", "default need includes frame");
  // every supplied run is needed: a tiles / close run without a result list is incomplete, even with tiles: false
  for (const extra of [{ scope: "tiles" }, { scope: "tiles", faces: null }, { scope: "close", faces: "x" }]) {
    assert.equal(P.faceBlurPlan({ loaded: true, runs: [...ok.runs, extra] }, 1000, 800, { tiles: false }).reason, "not-run", JSON.stringify(extra));
  }
  // a duplicate scope whose faces is not an array -> text only, although another run of that scope is fine
  assert.equal(P.faceBlurPlan({ loaded: true, runs: [...ok.runs, { scope: "frame", faces: null }] }, 1000, 800).reason, "not-run");
  assert.equal(P.faceBlurPlan({ loaded: true, runs: [...ok.runs, { scope: "upload" }] }, 1000, 800, { need: ["frame"] }).reason, "not-run", "also with an explicit need");
  for (const bad of [null, 7, { faces: [] }, { scope: 3, faces: [] }]) {
    assert.equal(P.faceBlurPlan({ loaded: true, runs: [...ok.runs, bad] }, 1000, 800).textOnly, true, JSON.stringify(bad));
  }
  // loaded must be exactly true
  for (const loaded of [1, "true", "yes", {}, [], undefined]) assert.equal(P.faceBlurPlan({ ...ok, loaded }, 1000, 800).reason, "model-missing", JSON.stringify(loaded));
  // a bad scale is never replaced by 1
  for (const scale of [0, -1, NaN, Infinity, "0.5", null]) {
    assert.equal(P.faceBlurPlan(ok, 1000, 800, { crop: { x: 0, y: 0, w: 500, h: 400 }, scale }).reason, "bad-frame", String(scale));
  }
  assert.equal(P.faceBlurPlan(ok, 1000, 800, { crop: { x: 0, y: 0, w: 500, h: 400 }, scale: 0.5 }).textOnly, false);
});

test("coverage: share of a box under disjoint regions (the 'left unblurred' metric)", () => {
  assert.equal(P.coverage({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 0, y: 0, w: 10, h: 10 }]), 1);
  assert.equal(P.coverage({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 5, y: 0, w: 10, h: 10 }]), 0.5);
  assert.equal(P.coverage({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 0, y: 0, w: 5, h: 4 }, { x: 0, y: 6, w: 5, h: 4 }]), 0.4);
  assert.equal(P.coverage({ x: 0, y: 0, w: 10, h: 10 }, []), 0);
  assert.equal(P.coverage({ x: 0, y: 0, w: 0, h: 10 }, [{ x: 0, y: 0, w: 10, h: 10 }]), 0);
  assert.deepEqual(P.mergeBoxes([{ x: 0, y: 0, w: 5, h: 5 }, { x: 5, y: 0, w: 5, h: 5 }]).length, 2, "touching edges are not an overlap");
});

test("tileRects: n x n overlapping tiles cover the frame; 2 x 2 at 1/3 = the P2 tiles; seams overlap by the asked share", () => {
  assert.deepEqual(P.tileRects(400, 300, 2, 1 / 3), [{ x: 0, y: 0, w: 240, h: 180 }, { x: 160, y: 0, w: 240, h: 180 }, { x: 0, y: 120, w: 240, h: 180 },
    { x: 160, y: 120, w: 240, h: 180 }], "same as the P2 tiles (60 % of each side, anchored at the corners)");
  for (const [W, H, n, o] of [[1600, 1200, 3, 0.2], [1600, 900, 4, 0.2], [401, 333, 3, 0.2], [400, 300, 4, 0.2]]) {
    const t = P.tileRects(W, H, n, o);
    assert.equal(t.length, n * n);
    for (const g of t) assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= W && g.y + g.h <= H, JSON.stringify(g));
    // every pixel column / row is inside some tile, and neighbours share about o of a tile
    for (let x = 0; x < W; x++) assert.ok(t.some(g => x >= g.x && x < g.x + g.w), "column " + x);
    for (let y = 0; y < H; y++) assert.ok(t.some(g => y >= g.y && y < g.y + g.h), "row " + y);
    const share = (t[0].x + t[0].w - t[1].x) / t[0].w;
    assert.ok(Math.abs(share - o) < 0.02, `overlap ${share} for ${W}x${H} n=${n}`);
  }
  assert.deepEqual(P.tileRects(100, 50, 1, 0.2), [{ x: 0, y: 0, w: 100, h: 50 }], "1 x 1 = the whole frame");
});
