#!/usr/bin/env node
// tools/omr-eval-gen.mjs — builds the locked OMR baseline set (owner order 2026-11-18): SYNTHETIC answer-sheet photos drawn
// programmatically in Node from the page's own sheet layout (lensiq-omr.js layout(): markers, orientation bar, format code,
// bubble rings, gray letters inside the bubbles, question numbers, header lines, ID boxes), filled with simulated pencil
// marks and "photographed" with a perspective, light, noise, a table around the paper. No real student data, no real
// names, no photos of people: every answer, student number and scribble comes from a seeded random generator.
//
//   node tools/omr-eval-gen.mjs --out ~/LENSIQ-field/evals/omr [--per 12]
//     writes <out>/<condition>/<condition>-NN.png (8-bit gray PNG) + <out>/manifest.json (truth for every bubble)
//     then lock BEFORE measuring:  node tools/eval-guard.mjs lock omr manifest.json <every png>   (see tools/omr-eval.mjs)
//
// Conditions (per sheet, a share of the answered items gets the condition's treatment; the rest are clean marks):
//   clean     dark 2B / pen fills; half the sheets flatbed-scanner style (white surround, no perspective), half a
//             straight phone photo
//   light     faint marks (hard pencil / pressed lightly): ink tiers 120 / 150 / 180 on paper ~248, grainy, 45 % of marks
//   outside   marks shifted 0.45-0.9 r off the bubble centre, or oversized scribbles spilling out (1.25-1.45 r), 45 %
//   double    a second full mark on another choice in 15 % of the items (truth: both bubbles filled, item = multi)
//   erasure   35 % of the items: the first choice marked, then erased (residual 10-45 % of the darkness + smudge), the
//             final answer marked on another choice (truth: erased bubble empty)
//   skew      sheet rotated 4-14 degrees in the photo, plus 1-2 creases (shading band + a fold that shortens the paper
//             beyond the crease by 1-2.5 %, which a 4-corner perspective cannot undo)
//   shadow    a hand / phone shadow: a soft-edged region at 35-60 % brightness over 20-50 % of the sheet, plus dimmer light
//   angle     phone held at an angle: strong keystone (top edge 55-78 % of the bottom edge), rotation, blur, lower
//             (vertical foreshortening 0.74-0.88), lower resolution (900 x 1600 frame), more noise
// Formats cycle per condition: 40 x 5 (A-E), 60 x 4 (ก-ง), 100 x 5 (A-E), 20 x 4 (1-4); 5 student-number digits each.
// Deterministic: seed = condition index * 1000 + sheet index (mulberry32). Rendering resolution 6 px / mm.
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { assertFreeSpace } from "./disk-guard.mjs";

const require = createRequire(import.meta.url);
const O = require("../lensiq-omr.js");

export const CONDITIONS = ["clean", "light", "outside", "double", "erasure", "skew", "shadow", "angle"];
export const FORMATS = [
  { n: 40, choices: 5, labels: "en" }, { n: 60, choices: 4, labels: "th" },
  { n: 100, choices: 5, labels: "en" }, { n: 20, choices: 4, labels: "num" }
];
const KS = 6; // sheet raster px per mm

// ------------------------------------------------------------------ helpers
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** 8-bit grayscale PNG, filter 0 on every row (tools/omr-eval.mjs decodes exactly this) */
export function encodePng(gray, w, h) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; Buffer.from(gray.buffer, gray.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
/** value hash noise in [0,1) for pixel (x, y) and a seed */
function hash01(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ sheet raster (mm coordinates, KS px / mm)
class Sheet {
  constructor(rng) {
    this.W = Math.round(O.A4W * KS); this.H = Math.round(O.A4H * KS); this.rng = rng;
    this.g = new Float32Array(this.W * this.H);
    const s = Math.floor(rng() * 1e9);
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) this.g[y * this.W + x] = 247 + 4 * hash01(x >> 2, y >> 2, s) - 2 + (hash01(x, y, s + 1) - 0.5) * 3; // paper fibre
  }
  /** multiply-blend ink (0 = black) with alpha a at pixel */
  ink(px, py, v, a) { if (px < 0 || py < 0 || px >= this.W || py >= this.H || a <= 0) return; const i = py * this.W + px; this.g[i] *= 1 - clamp(a, 0, 1) * (1 - v / 255); }
  rect(x, y, w, h, v) {
    const x0 = x * KS, y0 = y * KS, x1 = (x + w) * KS, y1 = (y + h) * KS;
    for (let py = Math.floor(y0); py < Math.ceil(y1); py++) for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
      const ax = clamp(Math.min(px + 1, x1) - Math.max(px, x0), 0, 1), ay = clamp(Math.min(py + 1, y1) - Math.max(py, y0), 0, 1);
      this.ink(px, py, v, ax * ay);
    }
  }
  /** anti-aliased ring (stroke width sw mm) or disc (sw = 0) */
  circle(cx, cy, r, v, sw) {
    const R = r + (sw || 0) + 0.3;
    for (let py = Math.floor((cy - R) * KS); py <= Math.ceil((cy + R) * KS); py++) for (let px = Math.floor((cx - R) * KS); px <= Math.ceil((cx + R) * KS); px++) {
      const d = Math.hypot((px + 0.5) / KS - cx, (py + 0.5) / KS - cy);
      const a = sw ? clamp((sw / 2 - Math.abs(d - r)) * KS + 0.5, 0, 1) : clamp((r - d) * KS + 0.5, 0, 1);
      this.ink(px, py, v, a);
    }
  }
  /** anti-aliased line segment */
  line(x1, y1, x2, y2, sw, v, alpha) {
    const R = sw / 2 + 0.3, al = alpha == null ? 1 : alpha;
    const lx = Math.min(x1, x2) - R, hx = Math.max(x1, x2) + R, ly = Math.min(y1, y2) - R, hy = Math.max(y1, y2) + R;
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-9;
    for (let py = Math.floor(ly * KS); py <= Math.ceil(hy * KS); py++) for (let px = Math.floor(lx * KS); px <= Math.ceil(hx * KS); px++) {
      const X = (px + 0.5) / KS, Y = (py + 0.5) / KS, t = clamp(((X - x1) * dx + (Y - y1) * dy) / L2, 0, 1);
      const d = Math.hypot(X - (x1 + t * dx), Y - (y1 + t * dy));
      this.ink(px, py, v, al * clamp((sw / 2 - d) * KS + 0.5, 0, 1));
    }
  }
  /** a glyph from strokes in a unit box (0..1 x 0..1), drawn at (x, y top-left) size w x h */
  glyph(strokes, x, y, w, h, sw, v) { for (const [a, b, c, d] of strokes) this.line(x + a * w, y + b * h, x + c * w, y + d * h, sw, v); }
  /** pseudo text: a row of glyph-like blocks (the real sheet prints Thai / English text; only its ink matters here) */
  text(x, y, len, size, v) {
    let cx = x;
    for (let i = 0; i < len; i++) {
      if (this.rng() < 0.15) { cx += size * 0.5; continue; }
      const gw = size * (0.4 + this.rng() * 0.25);
      this.glyph(GLYPHS[Math.floor(this.rng() * GLYPHS.length)], cx, y - size * 0.72, gw, size * 0.72, size * 0.09, v);
      cx += gw + size * 0.12;
    }
  }
}
// 7-segment style strokes for digits / letters, and a loop + stem for Thai letters
const SEG = { a: [0, 0, 1, 0], b: [1, 0, 1, 0.5], c: [1, 0.5, 1, 1], d: [0, 1, 1, 1], e: [0, 0.5, 0, 1], f: [0, 0, 0, 0.5], g: [0, 0.5, 1, 0.5] };
const segs = s => s.split("").map(k => SEG[k]);
const DIGIT = ["abcdef", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgedc", "abc", "abcdefg", "abcdfg"].map(segs);
const LETTER = {
  A: [[0, 1, 0.5, 0], [0.5, 0, 1, 1], [0.25, 0.55, 0.75, 0.55]], B: segs("afedg").concat([[1, 0.05, 1, 0.45], [1, 0.55, 1, 0.95]]), C: segs("afed"),
  D: [[0, 0, 0, 1], [0, 0, 0.7, 0], [0.7, 0, 1, 0.3], [1, 0.3, 1, 0.7], [1, 0.7, 0.7, 1], [0.7, 1, 0, 1]], E: segs("afedg")
};
const THAI = [[0.2, 0.3, 0.2, 1], [0.2, 0.3, 0.5, 0], [0.5, 0, 0.8, 0.3], [0.8, 0.3, 0.8, 1], [0.2, 0.55, 0.45, 0.55]];
const GLYPHS = DIGIT.concat(Object.values(LETTER), [THAI]);
function glyphFor(ch) {
  if (/[0-9]/.test(ch)) return DIGIT[+ch];
  if (LETTER[ch]) return LETTER[ch];
  return THAI;
}

/** the printed sheet, following lensiq-omr.js sheetSvg() geometry */
function drawPrinted(S, L) {
  for (const m of L.markers) S.rect(m.x - m.s / 2, m.y - m.s / 2, m.s, m.s, 12);
  S.rect(L.bar.x, L.bar.y, L.bar.w, L.bar.h, 12);
  for (const c of L.code) { if (c.on) S.rect(c.x - c.s / 2, c.y - c.s / 2, c.s, c.s, 12); else S.rect(c.x - 0.4, c.y - 0.4, 0.8, 0.8, 187); }
  S.text(22, 28, 22, 5, 20); // title
  for (const y of [38, 46, 54]) { S.text(22, y, 6, 3.4, 20); S.line(22 + 16, y + 0.8, L.idDigits ? 132 : 188, y + 0.8, 0.25, 85); }
  S.text(22, 64, 40, 3, 20);
  S.circle(24.4, 70, 2.4, 12, 0); S.text(29, 71.1, 1, 3, 20);
  S.circle(38.4, 70, 2.4, 51, 0.3); S.line(36.6, 68.2, 40.2, 71.8, 0.4, 12); S.line(40.2, 68.2, 36.6, 71.8, 0.4, 12); S.text(43, 71.1, 1, 3, 20);
  if (L.idDigits) {
    S.text(L.id[0][0].x - 3.1, 24.6, 8, 3, 20);
    for (const col of L.id) S.line(col[0].x - 2.8, 26.2, col[0].x + 2.8, 26.2, 0.25, 85), S.line(col[0].x - 2.8, 32.6, col[0].x + 2.8, 32.6, 0.25, 85),
      S.line(col[0].x - 2.8, 26.2, col[0].x - 2.8, 32.6, 0.25, 85), S.line(col[0].x + 2.8, 26.2, col[0].x + 2.8, 32.6, 0.25, 85);
    for (const col of L.id) for (let v = 0; v < 10; v++) { const b = col[v]; S.circle(b.x, b.y, b.r, 51, 0.25); S.glyph(DIGIT[v], b.x - 0.55, b.y - 0.85, 1.1, 1.7, 0.22, 154); }
    S.text(150, 94, 16, 2.6, 85);
  }
  const done = new Set();
  L.q.forEach((row, i) => {
    const col = L.qcol[i];
    if (!done.has(col.col)) { done.add(col.col); row.forEach((b, k) => S.glyph(glyphFor(L.letters[k]), b.x - 0.8, b.y - 7.4, 1.6, 2.0, 0.32, 12)); }
    const num = String(i + 1), dw = 1.5, x1 = row[0].x - row[0].r - 1.4;
    for (let j = 0; j < num.length; j++) S.glyph(DIGIT[+num[j]], x1 - (num.length - j) * (dw + 0.4), row[0].y - 1.1, dw, 2.2, 0.3, 12);
    for (let k = 0; k < row.length; k++) { const b = row[k]; S.circle(b.x, b.y, b.r, 51, 0.25); S.glyph(glyphFor(L.letters[k]), b.x - 0.6, b.y - 0.85, 1.2, 1.7, 0.22, 154); }
  });
  S.text(22, 275, 30, 2.6, 85);
}

/** a pencil / pen fill: irregular edge, grain, centre (cx, cy), radius rf, ink value (0 black), coverage alpha */
function pencil(S, cx, cy, rf, ink, cover, rng, grain) {
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28], am = [0.05 + rng() * 0.05, 0.03 + rng() * 0.03, 0.02], sx = 1 + (rng() - 0.5) * 0.14, sy = 1 + (rng() - 0.5) * 0.14;
  const seed = Math.floor(rng() * 1e9), R = rf * 1.25 + 0.3, gr = grain == null ? 0.25 : grain;
  const stroke = rng() * Math.PI; // hatching direction
  for (let py = Math.floor((cy - R) * KS); py <= Math.ceil((cy + R) * KS); py++) for (let px = Math.floor((cx - R) * KS); px <= Math.ceil((cx + R) * KS); px++) {
    const X = (px + 0.5) / KS - cx, Y = (py + 0.5) / KS - cy, ang = Math.atan2(Y, X);
    const edge = rf * (1 + am[0] * Math.sin(2 * ang + ph[0]) + am[1] * Math.sin(3 * ang + ph[1]) + am[2] * Math.sin(7 * ang + ph[2]));
    const d = Math.hypot(X / sx, Y / sy);
    const a = clamp((edge - d) * KS * 0.7 + 0.5, 0, 1);
    if (a <= 0) continue;
    const hatch = 0.5 + 0.5 * Math.sin(((X * Math.cos(stroke) + Y * Math.sin(stroke)) * KS) * 1.3);
    const g = 1 - gr + gr * (0.55 * hash01(px, py, seed) + 0.45 * hatch);
    S.ink(px, py, ink, a * cover * g);
  }
}
function cleanMark(S, b, rng) {
  const pen = rng() < 0.25;
  pencil(S, b.x + (rng() - 0.5) * 0.3 * b.r, b.y + (rng() - 0.5) * 0.3 * b.r, b.r * (0.84 + rng() * 0.2), pen ? 20 + rng() * 15 : 40 + rng() * 35, 0.88 + rng() * 0.12, rng, pen ? 0.1 : 0.3);
}

// ------------------------------------------------------------------ answers + marks per condition
const SHARE = { clean: 0, light: 0.45, outside: 0.45, double: 0.15, erasure: 0.35, skew: 0, shadow: 0, angle: 0 };
function fillSheet(S, L, cond, rng) {
  const truth = L.q.map(() => []), tag = L.q.map(row => row.map(() => "none"));
  for (let q = 0; q < L.n; q++) {
    if (rng() < 0.05) continue; // left blank
    const c = Math.floor(rng() * L.choices), b = L.q[q][c];
    truth[q].push(c);
    const treat = rng() < SHARE[cond];
    if (cond === "light" && treat) {
      const ink = [120, 150, 180][Math.floor(rng() * 3)];
      pencil(S, b.x + (rng() - 0.5) * 0.3 * b.r, b.y + (rng() - 0.5) * 0.3 * b.r, b.r * (0.8 + rng() * 0.2), ink, 0.75 + rng() * 0.2, rng, 0.45);
      tag[q][c] = "light" + ink;
    } else if (cond === "outside" && treat) {
      if (rng() < 0.6) {
        const ang = rng() * 6.283, off = b.r * (0.45 + rng() * 0.45);
        pencil(S, b.x + Math.cos(ang) * off, b.y + Math.sin(ang) * off, b.r * (0.85 + rng() * 0.15), 40 + rng() * 30, 0.9, rng, 0.3);
        tag[q][c] = "outside-shift" + (off / b.r).toFixed(2);
      } else {
        pencil(S, b.x + (rng() - 0.5) * 0.4 * b.r, b.y + (rng() - 0.5) * 0.4 * b.r, b.r * (1.25 + rng() * 0.2), 40 + rng() * 30, 0.9, rng, 0.35);
        tag[q][c] = "outside-big";
      }
    } else if (cond === "erasure" && treat) {
      const c0 = (c + 1 + Math.floor(rng() * (L.choices - 1))) % L.choices, b0 = L.q[q][c0], res = 0.1 + rng() * 0.35;
      pencil(S, b0.x, b0.y, b0.r * (0.85 + rng() * 0.15), 50, res, rng, 0.5); // what the eraser left
      pencil(S, b0.x + (rng() - 0.5) * b0.r, b0.y + (rng() - 0.5) * b0.r, b0.r * 1.3, 120, 0.12, rng, 0.6); // smudge
      tag[q][c0] = "erased" + res.toFixed(2);
      cleanMark(S, b, rng); tag[q][c] = "final";
    } else {
      cleanMark(S, b, rng); tag[q][c] = "clean";
    }
    if (cond === "double" && treat) {
      const c2 = (c + 1 + Math.floor(rng() * (L.choices - 1))) % L.choices;
      cleanMark(S, L.q[q][c2], rng); truth[q].push(c2); truth[q].sort((x, y) => x - y); tag[q][c2] = "double"; tag[q][c] = "double";
    }
  }
  // student number: random digits, clean marks (light / outside conditions apply to them too, same share)
  let sid = "";
  for (let d = 0; d < L.idDigits; d++) {
    const v = Math.floor(rng() * 10), b = L.id[d][v]; sid += v;
    if (cond === "light" && rng() < SHARE.light) pencil(S, b.x, b.y, b.r * 0.9, 150, 0.85, rng, 0.45);
    else cleanMark(S, b, rng);
    // handwritten digit in the box above (pencil strokes)
    S.glyph(DIGIT[v].map(s => s.map(t => t + (rng() - 0.5) * 0.12)), L.id[d][0].x - 1.3, 27, 2.6, 4.6, 0.35, 70);
  }
  // pseudo handwriting on the name / class lines (random strokes, not a name)
  for (const y of [38, 46]) {
    let x = 45 + rng() * 10, py = y - 1;
    for (let i = 0; i < 18 + Math.floor(rng() * 16); i++) { const nx = x + 0.6 + rng() * 1.6, ny = y - 0.4 - rng() * 3.2; S.line(x, py, nx, ny, 0.32, 60); x = nx; py = ny; }
  }
  if (rng() < 0.5) pencil(S, 20 + rng() * 170, 98 + rng() * 2, 0.5, 70, 0.8, rng); // stray dot in the margin above the grid
  return { truth, tag, sid };
}

// ------------------------------------------------------------------ "photograph"
function photograph(S, cond, idx, rng) {
  const scanner = cond === "clean" && idx % 2 === 0;
  const angle = cond === "angle";
  const w = angle ? 900 : 1200, h = angle ? 1600 : 1600;
  // sheet corners in the image
  const cx = w / 2 + (rng() - 0.5) * w * 0.04, cy = h / 2 + (rng() - 0.5) * h * 0.03;
  let sheetH = scanner ? 297 * (150 / 25.4) : angle ? 1050 + rng() * 180 : 1380 + rng() * 120; // px (before foreshortening)
  let rot = scanner ? (rng() - 0.5) * 1 : cond === "skew" ? (rng() < 0.5 ? -1 : 1) * (4 + rng() * 10) : (rng() - 0.5) * 5;
  if (angle) rot = (rng() - 0.5) * 16;
  if (scanner) sheetH = Math.min(sheetH, h - 20);
  const sw = sheetH * 210 / 297;
  let base = [[-sw / 2, -sheetH / 2], [sw / 2, -sheetH / 2], [sw / 2, sheetH / 2], [-sw / 2, sheetH / 2]];
  if (angle) { // camera tilted 25-45 degrees: vertical foreshortening + far (top) edge narrower
    const top = 0.6 + rng() * 0.2, fore = 0.74 + rng() * 0.14, lean = (rng() - 0.5) * 0.12 * sw;
    for (const p of base) p[1] *= fore;
    base[0][0] = base[0][0] * top + lean; base[1][0] = base[1][0] * top + lean;
  }
  else if (!scanner) { for (const p of base) { p[0] += (rng() - 0.5) * sw * 0.05; p[1] += (rng() - 0.5) * sheetH * 0.03; } }
  // the whole paper (with a 2 % margin) must be in the frame, as when the page shows a green frame: shrink until it fits
  const ra = rot * Math.PI / 180;
  let corners = null;
  for (let sc = 1; sc > 0.5; sc *= 0.97) {
    corners = base.map(([x, y]) => [cx + sc * (x * Math.cos(ra) - y * Math.sin(ra)), cy + sc * (x * Math.sin(ra) + y * Math.cos(ra))]);
    if (corners.every(([x, y]) => x > w * 0.02 && x < w * 0.98 && y > h * 0.02 && y < h * 0.98)) break;
  }
  const inv = O.homography(corners, [[0, 0], [O.A4W, 0], [O.A4W, O.A4H], [0, O.A4H]]);
  // creases (sheet mm): line point + normal, fold shortening factor beyond the line
  const creases = [];
  if (cond === "skew") {
    const k = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < k; i++) {
      const horiz = i === 0 ? rng() < 0.7 : rng() < 0.3, t = horiz ? 297 * (0.35 + rng() * 0.3) : 210 * (0.35 + rng() * 0.3), tilt = (rng() - 0.5) * 0.12;
      const n = horiz ? [Math.sin(tilt), Math.cos(tilt)] : [Math.cos(tilt), Math.sin(tilt)];
      const p = horiz ? [105, t] : [t, 148.5];
      creases.push({ p, n, f: 1 - (0.01 + rng() * 0.015), shade: 0.06 + rng() * 0.08, side: 0.9 + rng() * 0.08 });
    }
  }
  const unfold = (u, v) => { // flat-projected mm -> paper mm
    for (const c of creases) { const d = (u - c.p[0]) * c.n[0] + (v - c.p[1]) * c.n[1]; if (d > 0) { const e = d / c.f - d; u += c.n[0] * e; v += c.n[1] * e; } }
    return [u, v];
  };
  const paperShade = (u, v) => {
    let f = 1;
    for (const c of creases) { const d = (u - c.p[0]) * c.n[0] + (v - c.p[1]) * c.n[1]; f *= 1 - c.shade * Math.exp(-((d / 1.6) ** 2)); if (d > 0) f *= c.side; }
    return f;
  };
  // light
  const gx = (rng() - 0.5) * 0.35, gy = (rng() - 0.5) * 0.35, gl = scanner ? 0 : 1;
  let shadow = null;
  if (cond === "shadow") {
    const ang = rng() * 6.283, nx = Math.cos(ang), ny = Math.sin(ang);
    // edge offset so that 20-50 % of the sheet falls in the shadow
    const share = 0.2 + rng() * 0.3, reach = (Math.abs(nx) * sw + Math.abs(ny) * sheetH) / 2;
    shadow = { nx, ny, off: reach * (1 - 2 * share), dark: 0.35 + rng() * 0.25, soft: 15 + rng() * 40,
      blob: rng() < 0.5 ? { x: cx + (rng() - 0.5) * sw * 0.6, y: cy + (rng() - 0.5) * sheetH * 0.6, r: 80 + rng() * 120, dark: 0.75 + rng() * 0.1 } : null };
  }
  const dim = cond === "shadow" ? 0.8 + rng() * 0.1 : angle ? 0.85 + rng() * 0.1 : 1;
  const noise = scanner ? 4 : angle ? 16 : cond === "shadow" ? 12 : 9;
  const seed = Math.floor(rng() * 1e9), tableBase = scanner ? 246 : 55 + rng() * 60;
  const g = new Float32Array(w * h);
  const sub = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const samp = (u, v) => {
    const X = u * KS - 0.5, Y = v * KS - 0.5, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
    const at = (x, y) => S.g[clamp(y, 0, S.H - 1) * S.W + clamp(x, 0, S.W - 1)];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (const [ox, oy] of sub) {
      const [fu, fv] = O.apply(inv, x + ox, y + oy);
      const [u, v] = unfold(fu, fv);
      if (u >= 0 && v >= 0 && u < O.A4W && v < O.A4H) acc += samp(u, v) * paperShade(u, v);
      else acc += tableBase + 25 * (hash01(x >> 5, y >> 5, seed) - 0.5) + 10 * Math.sin(x * 0.02 + y * 0.013);
    }
    let val = acc / 4;
    val *= (1 + gl * (gx * (x / w - 0.5) + gy * (y / h - 0.5))) * dim;
    if (shadow) {
      const d = (x - cx) * shadow.nx + (y - cy) * shadow.ny - shadow.off;
      const t = clamp(0.5 + d / shadow.soft, 0, 1);
      val *= 1 - (1 - shadow.dark) * t;
      if (shadow.blob) { const bd = Math.hypot(x - shadow.blob.x, y - shadow.blob.y) / shadow.blob.r; val *= 1 - (1 - shadow.blob.dark) * clamp(1.5 - bd, 0, 1); }
    }
    g[y * w + x] = val;
  }
  let out = g;
  if (angle) { // focus / motion blur: two box passes of radius 1
    for (let pass = 0; pass < 2; pass++) {
      const o = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += out[yy * w + xx]; n++; } }
        o[y * w + x] = s / n;
      }
      out = o;
    }
  }
  const nr = mulberry32(seed + 3), px = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) px[i] = clamp(Math.round(out[i] + (nr() - 0.5) * noise), 0, 255);
  return { px, w, h, corners: corners.map(p => p.map(v => +v.toFixed(1))), meta: { scanner, rot: +rot.toFixed(2), creases: creases.length, shadow: !!shadow, noise } };
}

export function makeSheet(ci, i) {
  const cond = CONDITIONS[ci], rng = mulberry32(ci * 1000 + i + 1);
  const fmt = FORMATS[i % FORMATS.length];
  const L = O.layout({ n: fmt.n, choices: fmt.choices, idDigits: 5, labels: fmt.labels });
  const S = new Sheet(rng);
  drawPrinted(S, L);
  const f = fillSheet(S, L, cond, rng);
  const ph = photograph(S, cond, i, rng);
  return { cond, fmt, L, truth: f.truth, tag: f.tag, sid: f.sid, ph };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  // writes only (reads no set): the target folder is always given explicitly, e.g. --out ~/LENSIQ-field/evals/omr
  if (!arg("--out")) { console.error("usage: node tools/omr-eval-gen.mjs --out <folder> [--per 12]"); process.exit(1); }
  const out = resolve(arg("--out").replace(/^~(?=\/)/, homedir()));
  const per = +(arg("--per") || 12);
  assertFreeSpace({ minGB: 5, path: homedir(), label: "omr-eval-gen" });
  const manifest = { set: "omr-baseline", made: new Date().toISOString(),
    source: "synthetic (tools/omr-eval-gen.mjs, seeded; no real student data or names)", ks: KS, conditions: CONDITIONS, sheets: [] };
  for (let ci = 0; ci < CONDITIONS.length; ci++) {
    mkdirSync(join(out, CONDITIONS[ci]), { recursive: true });
    for (let i = 0; i < per; i++) {
      const s = makeSheet(ci, i), file = `${s.cond}/${s.cond}-${String(i + 1).padStart(2, "0")}.png`;
      writeFileSync(join(out, file), encodePng(s.ph.px, s.ph.w, s.ph.h));
      manifest.sheets.push({ file, cond: s.cond, n: s.fmt.n, choices: s.fmt.choices, labels: s.fmt.labels, idDigits: 5, w: s.ph.w, h: s.ph.h,
        sid: s.sid, truth: s.truth, tag: s.tag, corners: s.ph.corners, photo: s.ph.meta });
      process.stdout.write(`\r${file}   `);
    }
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest) + "\n");
  console.log(`\nwrote ${manifest.sheets.length} sheets + manifest.json to ${out}`);
}
