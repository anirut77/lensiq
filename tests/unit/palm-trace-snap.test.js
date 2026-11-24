"use strict";
// tests/unit/palm-trace-snap.test.js — owner inbox entry 24 item C (2026-11-23, branch palm-24c): on the live palm page, a main
// line (life / head / heart) found with low confidence can be traced by the user with one finger stroke ("ลากตามเส้นนี้");
// the stroke snaps to the nearest crease evidence of the photo, and only there. LOCKED (evals-locks/palm-90.sha256, field copy
// ~/LENSIQ-field/evals/palm-90/c/) BEFORE any product change. Source: synthetic (drawn ridge maps; no photo of a hand).
//   S1  a stroke drawn 5 px beside a clear crease (radius 8 px) ends on it: mean distance <= 1 px, every point moved <= the radius
//   S2  no crease (flat map) or a crease too weak to count (peak 0.15 < PalmCore.TRACE.thr): the stroke is kept as drawn (mean
//       move <= 0.5 px) — snapping never invents a line
//   S3  a crease farther than the radius (20 px away, radius 8 px) is not jumped to: every point moved <= the radius
//   S4  output: PalmCore.snapTrace(R, pathPx, radiusPx) -> points in drawing order (first point nearer the stroke's start),
//       at least 5 points, finite numbers
//   S5  texts: key palm.plTraceLine is TH "ลากตามเส้นนี้" (palm.html and palm.js), EN "Trace this line", ZH "沿这条线描"; the
//       button #plTraceLine ships hidden in palm.html; PalmCore.TRACE_LOW (the "low confidence" limit) exists and is marked
//       PROVISIONAL in the code
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const PC = require(path.join(ROOT, "palm.js"));
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

/** ridge map W x H with a crease y = y0 + slope * x (Gaussian profile, sigma 1.5 px, given peak); dir = line angle */
function ridge(W, H, y0, slope, peak) {
  const resp = new Float32Array(W * H), dir = new Float32Array(W * H), ang = Math.atan(slope);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (y - (y0 + slope * x)) * Math.cos(ang);
    resp[y * W + x] = peak * Math.exp(-(d * d) / (2 * 1.5 * 1.5));
    dir[y * W + x] = ang;
  }
  return { resp, dir, w: W, h: H };
}
const stroke = (y0, slope, off, n = 30) => Array.from({ length: n }, (_, i) => { const x = 30 + i * 6; return [x, y0 + slope * x + off]; });
const distTo = (p, y0, slope) => Math.abs(p[1] - (y0 + slope * p[0])) * Math.cos(Math.atan(slope));
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
/** distance of each output point to the input stroke (polyline) */
function moved(out, inp) {
  const seg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  return out.map(p => Math.min(...inp.slice(1).map((b, i) => seg(p, inp[i], b))));
}

test("S1 a stroke 5 px beside a clear crease snaps onto it, never farther than the radius", () => {
  assert.equal(typeof PC.snapTrace, "function", "PalmCore.snapTrace");
  for (const slope of [0, 0.12, -0.2]) {
    const R = ridge(240, 240, 100, slope, 1), inp = stroke(100, slope, 5), out = PC.snapTrace(R, inp, 8);
    const d = out.map(p => distTo(p, 100, slope));
    assert.ok(mean(d) <= 1, `slope ${slope}: mean distance ${mean(d).toFixed(2)} px > 1`);
    assert.ok(Math.max(...moved(out, inp)) <= 8 + 1e-6, `slope ${slope}: a point moved more than the radius`);
  }
});

test("S2 no crease or a too-weak crease: the stroke stays as drawn (snapping never invents a line)", () => {
  assert.ok(PC.TRACE && PC.TRACE.thr > 0.15, "TRACE.thr above the weak peak");
  for (const R of [ridge(240, 240, 100, 0, 0), ridge(240, 240, 100, 0, 0.15)]) {
    const inp = stroke(100, 0, 5), out = PC.snapTrace(R, inp, 8);
    assert.ok(mean(moved(out, inp)) <= 0.5, "mean move " + mean(moved(out, inp)).toFixed(2));
  }
});

test("S3 a crease farther than the radius is not jumped to", () => {
  const R = ridge(240, 240, 100, 0, 1), inp = stroke(100, 0, 20), out = PC.snapTrace(R, inp, 8);
  assert.ok(Math.max(...moved(out, inp)) <= 8 + 1e-6, "max move " + Math.max(...moved(out, inp)).toFixed(2));
});

test("S4 output keeps the drawing order, >= 5 finite points", () => {
  const R = ridge(240, 240, 100, 0.1, 1), inp = stroke(100, 0.1, 4).reverse(), out = PC.snapTrace(R, inp, 8);
  assert.ok(out.length >= 5 && out.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  assert.ok(Math.hypot(out[0][0] - inp[0][0], out[0][1] - inp[0][1]) < Math.hypot(out[0][0] - inp[inp.length - 1][0], out[0][1] - inp[inp.length - 1][1]), "first point near the stroke's start");
});

test("S5 texts in TH / EN / ZH; the button ships hidden; the low-confidence limit is PROVISIONAL", () => {
  const html = read("palm.html"), js = read("palm.js");
  assert.match(html, /<button[^>]*id="plTraceLine"[^>]*\bhidden\b[^>]*>ลากตามเส้นนี้<\/button>/, "palm.html #plTraceLine hidden, Thai label");
  assert.match(html, /id="plTraceLine"[^>]*data-i18n="palm\.plTraceLine"|data-i18n="palm\.plTraceLine"[^>]*id="plTraceLine"/);
  assert.match(read("i18n/en-fortune-palm.js"), /"palm\.plTraceLine":\s*"Trace this line"/);
  assert.match(read("i18n/zh-fortune-palm.js"), /"palm\.plTraceLine":\s*"沿这条线描"/);
  assert.ok(typeof PC.TRACE_LOW === "number" && PC.TRACE_LOW > 0 && PC.TRACE_LOW < 1, "PalmCore.TRACE_LOW");
  assert.match(js, /TRACE_LOW\s*=\s*[\d.]+;?\s*\/\/[^\n]*PROVISIONAL/, "TRACE_LOW marked PROVISIONAL");
});
