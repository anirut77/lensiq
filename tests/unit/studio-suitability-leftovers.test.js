"use strict";
// tests/unit/studio-suitability-leftovers.test.js — round 11 studio / photo booth helpers: photo-suitability pre-flight (studio-qa.js photoSuitability),
// ID-photo leftover / straight-cut finder (idLeftovers) and the no-outfit matte clean-up (studio-core.js cleanLeftovers)
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Q = require(path.join(__dirname, "..", "..", "studio-qa.js"));
const SC = require(path.join(__dirname, "..", "..", "studio-core.js"));

const fill = (w, h, f) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };
const rgba = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; } return d; };

// a 68-point face: only the points photoSuitability reads (eyes 36-47, nose tip 30) need to be meaningful
function landmarks(cx, eyeY, fw, noseDx = 0) {
  const P = Array.from({ length: 68 }, () => ({ x: cx, y: eyeY + fw * .5 }));
  for (let k = 36; k < 42; k++) P[k] = { x: cx - fw * .2 + (k - 38.5) * 2, y: eyeY };
  for (let k = 42; k < 48; k++) P[k] = { x: cx + fw * .2 + (k - 44.5) * 2, y: eyeY };
  P[30] = { x: cx + noseDx, y: eyeY + fw * .3 };
  return P;
}
const W = 300, H = 400, face = { cx: 150, chinX: 150, eyeY: 120, chinY: 190, fw: 100, angle: 0 };
const body = (x, y) => (Math.hypot((x - 150) / 55, (y - 140) / 75) < 1 || (y > 185 && Math.abs(x - 150) < 22 + Math.max(0, y - 230) * 1.4) ? 1 : 0);

test("photoSuitability: a frontal portrait with a visible neck, short hair and a plain top passes", () => {
  const alpha = fill(W, H, body), neck = fill(W, H, (x, y) => (y > 190 && y < 235 && Math.abs(x - 150) < 22 ? 1 : 0)), hair = fill(W, H, (x, y) => (y < 90 && body(x, y) ? 1 : 0));
  const px = rgba(W, H, () => [40, 50, 80]);
  const r = Q.photoSuitability({ px, alpha, hair, neck, W, H, face: { ...face, P: landmarks(150, 120, 100) } });
  assert.equal(r.ok, true, JSON.stringify(r.items));
  assert.deepEqual(r.items.map(i => i.k), ["frontal", "neck", "hair", "clothes", "framing"]);
});

test("photoSuitability: turned face, hidden neck, hair on the shoulders and a striped top each fail their item", () => {
  const alpha = fill(W, H, body), neck = new Float32Array(W * H), hair = fill(W, H, (x, y) => (body(x, y) && Math.abs(x - 150) > 40 ? 1 : 0));
  const px = rgba(W, H, (x, y) => ((y >> 2) & 1 ? [230, 230, 230] : [20, 20, 20]));
  const r = Q.photoSuitability({ px, alpha, hair, neck, W, H, face: { ...face, P: landmarks(150, 120, 100, 18) } });
  const bad = r.items.filter(i => i.ok === false).map(i => i.k);
  assert.equal(r.ok, false);
  for (const k of ["frontal", "neck", "hair", "clothes"]) assert.ok(bad.includes(k), k + " in " + bad);
});

test("photoSuitability: no landmarks -> frontal is 'not checked' (null), not a failure; tight crop fails framing", () => {
  const alpha = fill(W, 230, body), z = new Float32Array(W * 230);
  const r = Q.photoSuitability({ px: rgba(W, 230, () => [50, 50, 50]), alpha, hair: z, neck: z, W, H: 230, face });
  assert.equal(r.items.find(i => i.k === "frontal").ok, null);
  assert.equal(r.items.find(i => i.k === "framing").ok, false);
});

test("idLeftovers: a detached flag piece is an island; a torso ending above the bottom and a straight side edge are cuts", () => {
  const w = 300, h = 360, f = { cx: 150, chinY: 170, fw: 90 };
  // person: head + torso that stops at y = 300 (straight) and is cut straight at x = 40 on the left
  const pa = fill(w, h, (x, y) => (Math.hypot((x - 150) / 50, (y - 120) / 65) < 1 || (y > 165 && y < 300 && x >= 40 && x < 270) ? 1 : 0));
  for (let y = 20; y < 70; y++) for (let x = 250; x < 290; x++) pa[y * w + x] = 1; // detached flag piece
  const r = Q.idLeftovers({ pa, W: w, H: h, face: f });
  assert.equal(r.ok, false);
  assert.equal(r.islands.length, 1);
  assert.ok(r.cuts.some(c => c.k === "bottom" && Math.abs(c.y0 - 300) <= 1), JSON.stringify(r.cuts));
  assert.ok(r.cuts.some(c => c.k === "left" && Math.abs(c.x0 - 40) <= 1), JSON.stringify(r.cuts));
});

test("idLeftovers: a clean ID photo (torso reaching the bottom and the sides, sloping shoulders) has no findings", () => {
  const w = 300, h = 360, f = { cx: 150, chinY: 170, fw: 90 };
  const pa = fill(w, h, (x, y) => (Math.hypot((x - 150) / 50, (y - 120) / 65) < 1 || (y > 165 && Math.abs(x - 150) < 25 + (y - 165) * 1.6) ? 1 : 0));
  const r = Q.idLeftovers({ pa, W: w, H: h, face: f });
  assert.deepEqual(r, { islands: [], cuts: [], ok: true });
});

test("cleanLeftovers: removes a flag attached to the shoulder (parser says background), detached bits and faint lines; keeps the person", () => {
  const w = 400, h = 500, f = { cx: 200, eyeY: 150, chinY: 230, fw: 120 };
  const person = (x, y) => Math.hypot((x - 200) / 65, (y - 170) / 85) < 1 || (y > 225 && Math.abs(x - 200) < 30 + (y - 225) * .4);
  const keep = fill(w, h, (x, y) => (person(x, y) ? 1 : 0)), pp = fill(w, h, (x, y) => (person(x, y) ? .95 : .02));
  for (let y = 250; y < 480; y++) for (let x = 10; x < 110; x++) keep[y * w + x] = 1;            // flag touching the torso on the left
  for (let y = 20; y < 40; y++) for (let x = 340; x < 360; x++) keep[y * w + x] = 1;             // detached bit
  for (let x = 300; x < 390; x++) keep[100 * w + x] = .3;                                        // faint line
  const k = new Float32Array(keep), info = SC.cleanLeftovers(k, w, h, f, { pp });
  assert.equal(k[400 * w + 30], 0, "flag removed");
  assert.equal(k[30 * w + 350], 0, "detached bit removed");
  assert.equal(k[100 * w + 350], 0, "faint line removed");
  let lost = 0, tot = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (person(x, y)) { tot++; if (k[y * w + x] < 1) lost++; }
  assert.ok(lost / tot < .01, "person kept: lost " + lost + "/" + tot);
  assert.ok(info.parse > 0 && info.mainFrac > .1, JSON.stringify(info));
});

test("cleanLeftovers: the matte-failure signal (mainFrac) is tiny when the person is gone", () => {
  const w = 300, h = 360, keep = fill(w, h, (x, y) => (Math.hypot(x - 40, y - 330) < 12 ? 1 : 0));
  const info = SC.cleanLeftovers(keep, w, h, { cx: 150, eyeY: 120, chinY: 180, fw: 90 });
  assert.ok(info.mainFrac < .05, JSON.stringify(info));
});
