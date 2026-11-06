#!/usr/bin/env node
// tests/bench/qc.bench.mjs — bottle inspection accuracy of qc.js (QC.calibrate + QC.inspect, the page's own functions and
// default tolerances) on SYNTHETIC but deliberately harder images than the page's built-in simulator. No dataset needed.
//
//   node tests/bench/qc.bench.mjs [--good 60] [--per 25] [--cond "light|contrast"] [--json out.json]   (~25 min for all conditions)
//
// Renderer (independent of QC.simBottle, which the page was tuned on): 2×2 supersampled PET bottle with cylindrical
// shading, a specular highlight that runs through the fill window, concave meniscus, rounded shoulder, wrap-around label
// with foreshortened print, knurled cap; stop-position jitter on the belt; lighting drift after calibration, side light,
// glare, defocus blur and sensor noise. Defects are graded: some sizes are INSIDE the default tolerance (should pass) and
// some outside (should be rejected), so the table shows both misses and false rejects.
// Procedure = what an operator does: capture the empty belt, calibrate on one good bottle under nominal light, run.
// Synthetic images are not a substitute for a pilot on the real line; they show which conditions break which check.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, pct, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const QC = require(join(REPO, "qc.js"));
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const NGOOD = +opt("--good", 60), NPER = +opt("--per", 25);
const W = 640, H = 480, G = QC.simGeom("600", W, H);
const TOL = { fill: 6, fillUnit: "px", minContrast: 12, capDE: 15, capCov: 50, capTilt: 6, capHigh: 4, labelSim: 80, labelShift: 6 }; // qc.js defTol() (labelAngle unset = default 3.5°)

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = t => t * t * (3 - 2 * t);

const LIQ = { tea: [118, 70, 28], cola: [52, 30, 20], water: [176, 196, 210] };
/* colour of the bottle scene at sub-pixel point (x, y) or null = background */
function bottleColor(x, y, p) {
  const cx = p.cx, yy = y - p.dy;
  // cap (rotated rectangle around its centre, lifted)
  const capCx = cx, capCy = (G.capTop + G.capBottom) / 2 - p.capLift, ca = p.capTilt * Math.PI / 180;
  if (!p.noCap) {
    const u = (x - capCx) * Math.cos(ca) + (yy - capCy) * Math.sin(ca), v = -(x - capCx) * Math.sin(ca) + (yy - capCy) * Math.cos(ca);
    if (Math.abs(u) <= G.capW / 2 && Math.abs(v) <= (G.capBottom - G.capTop) / 2) {
      const n = u / (G.capW / 2), sh = 0.7 + 0.3 * Math.sqrt(1 - n * n), knurl = (Math.floor(u + 100) % 3 === 0) ? 0.82 : 1, top = v < -(G.capBottom - G.capTop) / 2 + 2 ? 1.25 : 1;
      return p.capCol.map(c => c * sh * knurl * top);
    }
  }
  if (yy < G.neckTop || yy >= G.belt) return null;
  let hw;
  if (yy >= G.bodyTop) hw = G.bodyW / 2;
  else if (yy >= G.neckBottom) hw = G.neckW / 2 + (G.bodyW - G.neckW) / 2 * smooth((yy - G.neckBottom) / G.shoulder);
  else hw = G.neckW / 2;
  const dx = x - cx;
  if (Math.abs(dx) > hw) return null;
  const n = dx / hw, cosn = Math.sqrt(Math.max(0, 1 - n * n)), shade = 0.74 + 0.26 * cosn;
  if (Math.abs(n) > 0.93) return [104, 114, 124];                                   // glass wall seen edge-on
  // label (wrap-around, foreshortened, optionally shifted / skewed)
  const la = p.labelSkew * Math.PI / 180, lc = G.labelTop + p.labelShift + G.labelH / 2;
  const arc = Math.asin(clamp(n, -1, 1)) * hw;                                       // position along the label
  const ly = (yy - lc) * Math.cos(la) - arc * Math.sin(la) + G.labelH / 2, lx = arc * Math.cos(la) + (yy - lc) * Math.sin(la);
  if (!p.noLabel && yy >= G.bodyTop && ly >= 0 && ly < G.labelH) {
    let c = [236, 232, 220];
    if (ly < 7 || ly >= G.labelH - 7) c = [150, 24, 40];
    else if (ly >= 18 && ly < 36) { const g = Math.floor((lx + 60) / 7); if (((g * 37) % 5) < 3 && Math.abs(lx) < 38 && ((lx + 60) % 7) < 5) c = [30, 40, 60]; }
    else if (ly >= 44 && ly < 52 && Math.abs(lx) < 30) c = [196, 140, 30];
    else if (ly >= 58 && ly < 66 && lx > -34 && lx < 6 && ((lx + 60) % 3) < 1.6) c = [60, 60, 60];
    return c.map(v => v * shade);
  }
  // highlight stripe (light source upper left)
  const hl = n > -0.58 && n < -0.38 ? 38 : 0;
  // liquid with concave meniscus (climbs the wall)
  const fy = p.fillY - 2.2 * n * n;
  const base = yy >= fy ? p.liq : [212, 220, 228];
  const sc = p.scratch && Math.abs((x - cx) - (yy - G.bodyTop - 40) * 0.6) < 0.7 && yy > G.bodyTop && yy < G.belt - 10 ? 70 : 0;
  return base.map(v => v * shade + hl + sc);
}
function render(p, r) {
  const img = { data: new Uint8ClampedArray(W * H * 4), width: W, height: H };
  const d = img.data, gain = p.light ?? 1, grad = p.grad || 0;
  const x0 = Math.floor(p.cx - G.bodyW / 2 - 14 - (p.empty ? 12 : 0)), x1 = Math.ceil(p.cx + G.bodyW / 2 + 14), y0 = Math.floor(G.capTop - 16 + p.dy), y1 = G.belt + 2;
  // only the area around the bottle is rendered with lighting/blur/noise (every inspection ROI lies inside it);
  // the rest of the frame stays a flat background
  const F = new Float32Array(W * H * 3), X0 = Math.max(0, x0 - 16), X1 = Math.min(W - 1, x1 + 16), Y0 = Math.max(0, y0 - 24);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!p.full && (x < X0 || x > X1 || y < Y0)) { const i = (y * W + x) * 3; F[i] = F[i + 1] = F[i + 2] = 200; continue; }
    const i = (y * W + x) * 3;
    let c;
    if (y >= G.belt) { const v = ((x + p.beltShift) % 48 + 48) % 48 < 6 ? 88 : 62; c = [v, v, v + 4]; }
    else { const v = 232 - Math.abs(x - W / 2) * 0.03 - y * 0.02; c = [v - 4, v, v + 2]; }
    if (!p.empty && x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      const acc = [0, 0, 0];
      for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { const b = bottleColor(x + sx, y + sy, p) || c; acc[0] += b[0]; acc[1] += b[1]; acc[2] += b[2]; }
      c = acc.map(v => v / 4);
    }
    const lg = gain * (1 + grad * (x / W - 0.5));
    const gl = p.glare ? p.glare * Math.exp(-((x - p.cx - 6) ** 2 / (2 * 7 * 7) + (y - p.dy - 150) ** 2 / (2 * 30 * 30))) : 0;
    const ct = p.contrast ?? 1; // contrast change around mid-grey (camera contrast / gamma drift after calibration)
    F[i] = (c[0] * lg - 128) * ct + 128 + gl; F[i + 1] = (c[1] * lg - 128) * ct + 128 + gl; F[i + 2] = (c[2] * lg - 128) * ct + 128 + gl;
  }
  if (p.blur) blur(F, p.blur, p.full ? [0, W - 1, 0] : [X0, X1, Y0]);
  for (let k = 0, j = 0; k < F.length; k += 3, j += 4) {
    const px = (k / 3) % W, py = (k / 3 / W) | 0, inside = p.full || (px >= X0 && px <= X1 && py >= Y0);
    const nz = p.noise && inside ? gauss(r) * p.noise : 0;
    d[j] = F[k] + nz; d[j + 1] = F[k + 1] + nz; d[j + 2] = F[k + 2] + nz; d[j + 3] = 255;
  }
  return img;
}
function blur(F, s, [bx0, bx1, by0]) {
  const R = Math.ceil(s * 3), k = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * s * s))), ks = k.reduce((a, b) => a + b);
  const T = new Float32Array(F.length);
  for (let y = by0; y < H; y++) for (let x = bx0; x <= bx1; x++) for (let c = 0; c < 3; c++) { let a = 0; for (let i = -R; i <= R; i++) a += F[(y * W + clamp(x + i, bx0, bx1)) * 3 + c] * k[i + R]; T[(y * W + x) * 3 + c] = a / ks; }
  for (let y = by0; y < H; y++) for (let x = bx0; x <= bx1; x++) for (let c = 0; c < 3; c++) { let a = 0; for (let i = -R; i <= R; i++) a += T[(clamp(y + i, by0, H - 1) * W + x) * 3 + c] * k[i + R]; F[(y * W + x) * 3 + c] = a / ks; }
}

const CAP = [30, 92, 200];
const nominal = (extra = {}) => ({ cx: W / 2, dy: 0, fillY: G.fillY, liq: LIQ.tea, capCol: CAP, capLift: 0, capTilt: 0, labelShift: 0, labelSkew: 0, beltShift: 0, noise: 3, ...extra });
/* defects: [label, expected reason(s) or null = within tolerance -> should PASS, params] */
const DEFECTS = [
  ["fill 3 px low (inside ±6 px tol.)", null, { fillD: 3 }],
  ["fill 9 px low", ["under"], { fillD: 9 }],
  ["fill 16 px low", ["under"], { fillD: 16 }],
  ["fill 9 px high", ["over"], { fillD: -9 }],
  ["no cap", ["capMissing"], { noCap: true }],
  ["wrong cap colour (red)", ["capColor"], { capCol: [200, 44, 40] }],
  ["cap a shade darker (ΔE≈8, inside tol.)", null, { capCol: [26, 78, 172] }],
  ["cap tilted 3° (inside 6° tol.)", null, { capTilt: 3 }],
  ["cap tilted 9°", ["capTilt", "capHigh"], { capTilt: 9 }],
  ["cap tilted 15°", ["capTilt", "capHigh"], { capTilt: 15 }],
  ["cap raised 2 px (inside 4 px tol.)", null, { capLift: 2 }],
  ["cap raised 6 px", ["capHigh"], { capLift: 6 }],
  ["cap raised 10 px", ["capHigh"], { capLift: 10 }],
  ["no label", ["labelMissing"], { noLabel: true }],
  ["label 3 px low (inside 6 px tol.)", null, { labelShift: 3 }],
  ["label 10 px low", ["labelShift"], { labelShift: 10 }],
  ["label 20 px low", ["labelShift"], { labelShift: 20 }],
  ["label skewed 2° (inside 3.5° tol.)", null, { labelSkew: 2 }],
  ["label skewed 5°", ["labelShift"], { labelSkew: 5 }],
  ["label skewed 10°", ["labelShift"], { labelSkew: 10 }],
  ["scratch on body (not inspected)", null, { scratch: true }]
];
const CONDS = [
  ["nominal (as calibrated)", {}],
  ["stop position ±8 px / ±3 px", { jitter: [8, 3] }],
  ["light +10% after calibration", { light: 1.1 }],
  ["light +25% after calibration", { light: 1.25 }],
  ["light −10% after calibration", { light: 0.9 }],
  ["light −30% after calibration", { light: 0.7 }],
  ["brightness +20% after calibration", { light: 1.2 }],
  ["brightness −20% after calibration", { light: 0.8 }],
  ["contrast +10% after calibration", { contrast: 1.1 }],
  ["contrast −10% after calibration", { contrast: 0.9 }],
  ["brightness +20% and contrast −10%", { light: 1.2, contrast: 0.9 }],
  ["brightness −20% and contrast +10%", { light: 0.8, contrast: 1.1 }],
  ["side light (±15% across frame)", { grad: 0.3 }],
  ["glare on the neck", { glare: 60 }],
  ["slight defocus (σ 1.2 px)", { blur: 1.2 }],
  ["sensor noise σ 10", { noise: 10 }],
  ["everything at once (±5 px, −15% light, side light, σ 0.8 blur, noise 8)", { jitter: [5, 2], light: 0.85, grad: 0.2, blur: 0.8, noise: 8 }]
];

function sample(r, cond, defect = {}) {
  const j = cond.jitter || [0, 0];
  const p = nominal({ ...cond, ...defect, cx: W / 2 + (r() * 2 - 1) * j[0], dy: Math.round((r() * 2 - 1) * j[1]), beltShift: (r() * 48) | 0 });
  if (defect.fillD) p.fillY = G.fillY + defect.fillD;
  return p;
}

/* --dump file.bmp: contact sheet of the 160×340 bottle area (good, then each defect) for a visual check */
if (opt("--dump")) {
  const r = rng(5), tiles = [nominal(), ...DEFECTS.map(d => sample(r, {}, d[2]))].map(p => render(p, r));
  const tw = 160, th = 340, sw = tw * tiles.length, buf = Buffer.alloc(54 + sw * th * 3);
  buf.write("BM"); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14); buf.writeInt32LE(sw, 18); buf.writeInt32LE(-th, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  tiles.forEach((im, t) => { for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const i = ((y + 80) * W + x + W / 2 - tw / 2) * 4, o = 54 + (y * sw + t * tw + x) * 3; buf[o] = im.data[i + 2]; buf[o + 1] = im.data[i + 1]; buf[o + 2] = im.data[i]; } });
  writeFileSync(opt("--dump"), buf); console.log("wrote " + opt("--dump")); process.exit(0);
}

const results = [];
for (const liqName of ["tea", "water"]) {
  for (const withBg of [true, false]) {
    if (liqName === "water" && !withBg) continue;
    const r0 = rng(1);
    const bg = render(nominal({ empty: true, liq: LIQ[liqName] }), r0);
    const rec = { rois: G.rois, mode: "dark", tol: { ...TOL } };
    let golden;
    try { golden = QC.calibrate(render(nominal({ liq: LIQ[liqName] }), r0), rec, withBg ? bg : null); }
    catch (e) { results.push({ liq: liqName, withBg, calibError: e.message }); console.log(`calibration failed (${liqName}, bg ${withBg}): ${e.message}`); continue; }
    rec.golden = golden;
    for (const [cname, cond] of CONDS.filter(([n]) => !opt("--cond") || opt("--cond").split("|").some(c => n.includes(c)))) {
      const c = { ...cond, liq: LIQ[liqName] }, r = rng(cname.length * 31 + (withBg ? 7 : 3));
      const row = { liq: liqName, withBg, cond: cname, good: { n: 0, rej: 0, reasons: {} }, defects: [] };
      for (let i = 0; i < NGOOD; i++) {
        const res = QC.inspect(render(sample(r, c), r), rec, withBg ? bg : null);
        row.good.n++; if (!res.pass) { row.good.rej++; for (const k of res.reasons) row.good.reasons[k] = (row.good.reasons[k] || 0) + 1; }
      }
      for (const [dname, expect, dp] of DEFECTS) {
        let rej = 0, right = 0;
        for (let i = 0; i < NPER; i++) {
          const res = QC.inspect(render(sample(r, c, dp), r), rec, withBg ? bg : null);
          if (!res.pass) rej++;
          if (expect ? res.reasons.some(k => expect.includes(k)) : res.pass) right++;
        }
        row.defects.push({ name: dname, expect, n: NPER, rejected: rej / NPER, correct: right / NPER });
      }
      results.push(row);
      process.stderr.write(".");
    }
  }
}
process.stderr.write("\n");

console.log(`\n## QC bottle inspection — qc.js calibrate/inspect, default tolerances, synthetic renderer (${NGOOD} good + ${NPER} per defect per condition)\n`);
for (const set of [["tea", true], ["tea", false], ["water", true]]) {
  const rows = results.filter(x => x.liq === set[0] && x.withBg === set[1] && x.cond);
  if (!rows.length) continue;
  console.log(`\n### ${set[0] === "tea" ? "dark drink (tea)" : "clear water"} — ${set[1] ? "with empty-belt background image" : "without background image"}\n`);
  const head = ["condition", "good bottles rejected", ...DEFECTS.map(d => d[0])];
  // transpose for readability: one row per defect, one column per condition
  const cols = rows.map(rw => rw.cond);
  console.log(table(["", ...cols.map((c, i) => "C" + (i + 1))], [
    ["good bottles: false reject", ...rows.map(rw => pct(rw.good.rej / rw.good.n, 0))],
    ...DEFECTS.map((d, k) => [d[0] + (d[1] ? " → reject" : " → pass"), ...rows.map(rw => pct(rw.defects[k].expect ? rw.defects[k].rejected : 1 - rw.defects[k].rejected, 0))])
  ]));
  console.log(cols.map((c, i) => `C${i + 1} = ${c}`).join(" · "));
  console.log("false-reject reasons: " + rows.map((rw, i) => `C${i + 1} ${JSON.stringify(rw.good.reasons)}`).join(" "));
  void head;
}
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify({ date: new Date().toISOString(), NGOOD, NPER, tol: TOL, results }, null, 1)); console.log("wrote " + opt("--json")); }
