"use strict";
// tests/unit/studio-fit-warp.test.js — LOCKED (owner-approved item 24, studio garment fit). Written and hashed in
// ~/LENSIQ-field/evals/tryon-fit/locked.sha256 BEFORE SC.personTargets / SC.templateWarpTo and the new handles existed.
// Measures, on the synthetic set tests/unit/fixtures/studio-fit-set.js (source: SYNTHETIC, no photo of anyone), how far
// the garment's neck, shoulder-tip and hem points land from the person's own points: BEFORE (today's similarity fit +
// per-side shoulder offsets) vs AFTER (per-point targets measured on the person + thin-plate spline). Targets in F.TARGETS.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const SC = require(path.join(ROOT, "studio-core.js"));
const { CANON } = require(path.join(ROOT, "photobooth-outfits.js"));
const F = require("./fixtures/studio-fit-set.js");

let rows = null;
const getRows = () => rows || (rows = F.run(SC, CANON));
const fmt = s => JSON.stringify(s, (k, v) => typeof v === "number" ? Math.round(v * 100) / 100 : v);

test("set: 9 conditions × 8 synthetic people × 3 garments; every garment has 7 anchors; API exists", () => {
  assert.equal(F.cases().length, 72);
  for (const k of F.GARMENTS) { const g = F.garment(k), a = SC.templateAnchors(g.alpha, g.W, g.H); assert.ok(a && a.length === 7, k); }
  assert.equal(typeof SC.personTargets, "function", "SC.personTargets");
  assert.equal(typeof SC.templateWarpTo, "function", "SC.templateWarpTo");
  assert.equal(getRows().length, 72 * 3);
});

test("shoulder tips: AFTER mean ≤ 60 % of BEFORE, AFTER p90 ≤ 7 px (0.1 face width)", () => {
  const s = F.summarize(getRows(), "shoulder");
  console.log("shoulder px " + fmt(s.all));
  assert.ok(s.all.after.mean <= F.TARGETS.shoulderMeanRatio * s.all.before.mean, fmt(s.all));
  assert.ok(s.all.after.p90 <= F.TARGETS.shoulderP90Px, fmt(s.all));
});

test("neck: AFTER mean not worse than BEFORE, AFTER p90 ≤ 7 px", () => {
  const s = F.summarize(getRows(), "neck");
  console.log("neck px " + fmt(s.all));
  assert.ok(s.all.after.mean <= s.all.before.mean, fmt(s.all));
  assert.ok(s.all.after.p90 <= F.TARGETS.neckP90Px, fmt(s.all));
});

test("hem corners vs the body edge: AFTER mean ≤ 60 % of BEFORE", () => {
  const s = F.summarize(getRows(), "hem");
  console.log("hem px " + fmt(s.all));
  assert.ok(s.all.after.n > 0 && s.all.after.mean <= F.TARGETS.hemMeanRatio * s.all.before.mean, fmt(s.all));
});

test("no condition gets worse: per condition AFTER mean (shoulder, neck) ≤ BEFORE mean + 1 px", () => {
  for (const m of ["shoulder", "neck"]) {
    const s = F.summarize(getRows(), m);
    for (const [c, v] of Object.entries(s.byCond)) {
      console.log(`${m} ${c} ` + fmt(v));
      assert.ok(v.after.mean <= v.before.mean + F.TARGETS.perCondSlackPx, `${m} ${c} ` + fmt(v));
    }
  }
});

test("rendered: the warped garment, re-measured, sits closer to the shoulder tips AFTER than BEFORE", () => {
  const s = F.summarize(getRows(), "shoulder", ["rBefore", "rAfter"]);
  console.log("rendered shoulder px " + fmt(s.all));
  assert.ok(s.all.rAfter.n >= getRows().length * .9, "anchors found again on ≥ 90 % of warped garments " + fmt(s.all));
  assert.ok(s.all.rAfter.mean < s.all.rBefore.mean, fmt(s.all));
});

test("personTargets: one target per anchor (same order, same k), each marked measured or canon", () => {
  const g = F.garment("jacket"), an = SC.templateAnchors(g.alpha, g.W, g.H), P = F.person(F.params(1, 0));
  const Fm = SC.measureShoulders(P.alpha, P.W, P.H, P.face, { canon: CANON }), fit = SC.fitFromTargets({ chin: Fm.chin, l: Fm.l, r: Fm.r }, CANON);
  const pt = SC.personTargets(an, fit, P.alpha, P.W, P.H, P.face, { side: Fm.side });
  assert.equal(pt.targets.length, an.length);
  pt.targets.forEach((t, i) => { assert.equal(t.k, an[i].k); assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y)); assert.ok(t.src === "measured" || t.src === "canon", t.src); });
  assert.ok(pt.targets.filter(t => t.src === "measured").length >= 5, "most points measured on a clear silhouette");
});

test("personTargets falls back to today's targets where nothing can be measured (empty body)", () => {
  const g = F.garment("tee"), an = SC.templateAnchors(g.alpha, g.W, g.H), W = F.W, H = F.H;
  const alpha = new Float32Array(W * H), face = { cx: 180, chinX: 180, chinY: 160, fw: 70, eyeY: 97 };
  const fit = { N: { x: 180, y: 200 }, s: 68, theta: 0 }, side = { l: [0, 0], r: [0, 0] };
  const base = SC.templateWarp(an, fit, { side }).targets, pt = SC.personTargets(an, fit, alpha, W, H, face, { side });
  pt.targets.forEach((t, i) => { assert.equal(t.src, "canon"); assert.ok(Math.hypot(t.x - base[i].x, t.y - base[i].y) < 1e-6, t.k); });
});

test("templateWarpTo (draggable handles): every target maps back to its anchor; moving one handle moves only its region", () => {
  const g = F.garment("jacket"), an = SC.templateAnchors(g.alpha, g.W, g.H);
  const fit = { N: { x: 180, y: 200 }, s: 68, theta: 0 }, T = SC.templateWarp(an, fit).targets.map((p, i) => ({ ...p, k: an[i].k }));
  const w = SC.templateWarpTo(an, T);
  T.forEach((t, i) => { const p = w.inv(t.x, t.y); assert.ok(Math.hypot(p.x - an[i].x, p.y - an[i].y) < 1.5, "maps back " + an[i].k); });
  const hl = an.findIndex(a => a.k === "hl"), moved = T.map((t, i) => i === hl ? { ...t, x: t.x - 20 } : t), w2 = SC.templateWarpTo(an, moved);
  moved.forEach((t, i) => { const p = w2.inv(t.x, t.y); assert.ok(Math.hypot(p.x - an[i].x, p.y - an[i].y) < 1.5, "moved set maps back " + an[i].k); });
  const nk = T[an.findIndex(a => a.k === "neck")], a1 = w.inv(nk.x, nk.y + 10), a2 = w2.inv(nk.x, nk.y + 10);
  const h1 = w.inv(T[hl].x + 10, T[hl].y - 10), h2 = w2.inv(T[hl].x + 10, T[hl].y - 10);
  assert.ok(Math.hypot(a1.x - a2.x, a1.y - a2.y) < Math.hypot(h1.x - h2.x, h1.y - h2.y), "the neck region moves less than the dragged hem region");
});

test("studio page: seven draggable fit handles (neck, collar ×2, shoulder ×2, hem ×2) with TH / EN / ZH hint", () => {
  const js = fs.readFileSync(path.join(ROOT, "studio.js"), "utf8");
  assert.ok(/SC\.personTargets\(/.test(js) && /SC\.templateWarpTo\(/.test(js), "studio.js uses the per-point fit");
  assert.ok(/\[\s*"chin",\s*"cl",\s*"cr",\s*"l",\s*"r",\s*"hl",\s*"hr"\s*\]/.test(js), "handle list chin, cl, cr, l, r, hl, hr");
  assert.ok(/T\("studio\.js\.hint\.fitPts",\s*"[^"]*ชายเสื้อ[^"]*"/.test(js), "Thai hint names the hem (ชายเสื้อ)");
  for (const [f, re] of [["en-studio.js", /"studio\.js\.hint\.fitPts":\s*"[^"]*hem[^"]*"/i], ["zh-studio.js", /"studio\.js\.hint\.fitPts":\s*"[^"]*下摆[^"]*"/]]) {
    assert.ok(re.test(fs.readFileSync(path.join(ROOT, "i18n", f), "utf8")), f + " has studio.js.hint.fitPts");
  }
});
